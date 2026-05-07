// Web stub — Vercel handles updates via deploy.
export interface RemoteVersion {
  version: string;
  versionCode?: number;
  url: string;
  notes?: string;
  minVersion?: string;
  publishedAt?: string;
}

export interface UpdateInfo {
  remote: RemoteVersion;
  installedVersion: string;
  forced: boolean;
}

export type ProgressCallback = (downloadedBytes: number, totalBytes: number) => void;

export function compareVersions(_a: string, _b: string): number {
  return 0;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  return null;
}

export async function downloadAndInstallApk(
  _remote: RemoteVersion,
  _onProgress?: ProgressCallback,
): Promise<void> {
  throw new Error('APK install not supported on web');
}

export function formatBytes(_bytes: number): string {
  return '';
}
