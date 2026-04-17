// services/appUpdater.ts
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system';
import * as Updates from 'expo-updates';
import { startActivityAsync } from 'expo-intent-launcher';

const CDN_BASE = 'https://dexa-pos-uploads.b-cdn.net';

function getVersionManifestUrl(): string {
  const folder = Updates.channel === 'preview' ? 'releases-preview' : 'releases';
  return `${CDN_BASE}/${folder}/version.json`;
}

export interface VersionManifest {
  version: string;
  buildNumber: number;
  apkUrl: string;
  releaseNotes: string;
  forceUpdate: boolean;
}

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidManifest(obj: unknown): obj is VersionManifest {
  if (!obj || typeof obj !== 'object') return false;
  const m = obj as Record<string, unknown>;
  return (
    typeof m.version === 'string' && m.version.length > 0 &&
    typeof m.buildNumber === 'number' && Number.isFinite(m.buildNumber) &&
    typeof m.apkUrl === 'string' && isValidHttpUrl(m.apkUrl) &&
    typeof m.releaseNotes === 'string' &&
    typeof m.forceUpdate === 'boolean'
  );
}

export async function checkForNativeUpdate(): Promise<VersionManifest | null> {
  if (__DEV__) return null;
  try {
    const res = await fetch(getVersionManifestUrl());
    if (!res.ok) return null;

    const raw: unknown = await res.json();
    if (!isValidManifest(raw)) return null;

    const currentBuild = Number(Application.nativeBuildVersion ?? 0);
    return raw.buildNumber > currentBuild ? raw : null;
  } catch {
    return null; // offline or malformed — fail silently
  }
}

export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  // Guard: reject non-http URLs before touching the filesystem
  if (!isValidHttpUrl(apkUrl)) {
    throw new Error('Invalid APK URL — must be http or https.');
  }

  const localUri = `${FileSystem.documentDirectory}update.apk`;

  // Clean up any leftover partial download from a previous attempt
  const existing = await FileSystem.getInfoAsync(localUri);
  if (existing.exists) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    apkUrl,
    localUri,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      if (onProgress && totalBytesExpectedToWrite > 0) {
        onProgress(totalBytesWritten / totalBytesExpectedToWrite);
      }
    }
  );

  const result = await downloadResumable.downloadAsync();

  if (!result) {
    throw new Error('Download returned no result.');
  }

  // HTTP-level failure (e.g. 404) — the file will exist but be empty/error body
  if (result.status !== 200) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    throw new Error(`APK download failed (HTTP ${result.status}).`);
  }

  // Verify the file actually exists and has a non-zero size
  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists || info.size === 0) {
    throw new Error('Downloaded file is empty or missing.');
  }

  // Android 7+ requires a content:// URI via FileProvider — file:// throws
  // FileUriExposedException when passed to another app via Intent
  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  await startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}
