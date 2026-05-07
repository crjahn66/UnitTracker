import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';

const VERSION_JSON_URL =
  'https://kizqpjitayvlezcjvdeo.supabase.co/storage/v1/object/public/app-releases/version.json';

export interface RemoteVersion {
  version: string;        // semver "1.0.1"
  versionCode?: number;   // monotonic, optional
  url: string;            // public URL to apk
  notes?: string;
  minVersion?: string;    // if installed < minVersion, force update
  publishedAt?: string;
}

export interface UpdateInfo {
  remote: RemoteVersion;
  installedVersion: string;
  forced: boolean;
}

/** Compare semver-ish strings ("1.2.3"). Returns 1, 0, -1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** Fetches version.json and returns UpdateInfo if a newer version exists. Null otherwise. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS !== 'android') return null;

  const installedVersion = Application.nativeApplicationVersion ?? '0.0.0';

  const res = await fetch(VERSION_JSON_URL + '?t=' + Date.now(), {
    headers: { 'cache-control': 'no-cache' },
  });
  if (!res.ok) throw new Error(`version.json fetch failed: ${res.status}`);
  const remote = (await res.json()) as RemoteVersion;

  if (!remote?.version || !remote?.url) {
    throw new Error('version.json missing required fields');
  }

  const newer = compareVersions(remote.version, installedVersion) > 0;
  if (!newer) return null;

  const forced = !!remote.minVersion &&
    compareVersions(installedVersion, remote.minVersion) < 0;

  return { remote, installedVersion, forced };
}

export type ProgressCallback = (downloadedBytes: number, totalBytes: number) => void;

/**
 * Downloads APK to cache and triggers Android installer.
 * Caller's progress callback is invoked during download.
 */
export async function downloadAndInstallApk(
  remote: RemoteVersion,
  onProgress?: ProgressCallback,
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('APK install only supported on Android');
  }

  const cacheDir = FileSystem.cacheDirectory ?? '';
  if (!cacheDir) throw new Error('No cache directory available');

  const safeName = `UnitTracker-${remote.version}.apk`;
  const localPath = cacheDir + safeName;

  // Remove any previous download (avoid stale partials)
  try {
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) await FileSystem.deleteAsync(localPath, { idempotent: true });
  } catch {}

  const downloadResumable = FileSystem.createDownloadResumable(
    remote.url,
    localPath,
    {},
    (p) => {
      if (onProgress) onProgress(p.totalBytesWritten, p.totalBytesExpectedToWrite);
    },
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) throw new Error('APK download failed');

  // Get content:// URI via Expo's bundled FileProvider so the installer can read it
  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  // FLAG_GRANT_READ_URI_PERMISSION = 1
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1,
    type: 'application/vnd.android.package-archive',
  });
}

/** Format bytes as KB/MB string for display. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
