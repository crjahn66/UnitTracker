import { Platform } from 'react-native';
import { supabase } from './supabase';
import { useStore } from '../store/useStore';
import { UnitsStore, GeneralIssue } from '../types';
import { uploadLocalPhotos, downloadPhotosToDevice } from './imageStorage';

export interface SyncResult {
  success: boolean;
  error?: string;
  warning?: string;
  timestamp?: string;
}

// Module-level sync status — read via getSyncStatus(), updated after each push/sync
const LS_KEY = 'syncLastSyncedAt';
let _lastSyncedAt: number | null = (() => {
  try { const v = (globalThis as any).localStorage?.getItem(LS_KEY); return v ? Number(v) : null; } catch { return null; }
})();
let _isOnline: boolean = true;
let _hasPendingChanges: boolean = false;
let _lastPushedAt: number = 0;
type SyncStatusListener = () => void;
const _listeners = new Set<SyncStatusListener>();

function notifyListeners() { _listeners.forEach((l) => l()); }

export function getSyncStatus() {
  return { lastSyncedAt: _lastSyncedAt, isOnline: _isOnline, hasPendingChanges: _hasPendingChanges };
}

export function subscribeSyncStatus(listener: SyncStatusListener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function markSuccess() {
  _lastSyncedAt = Date.now();
  _lastPushedAt = _lastSyncedAt;
  _isOnline = true;
  _hasPendingChanges = false;
  try { (globalThis as any).localStorage?.setItem(LS_KEY, String(_lastSyncedAt)); } catch {}
  notifyListeners();
}

function markFailure() {
  _isOnline = false;
  notifyListeners();
}

// On native: poll updated_at every 30s so remote changes (e.g. web photo uploads)
// flip _hasPendingChanges to true. Ignore if updated_at is within 10s of our own
// last push to avoid self-triggering.
async function checkForRemoteChanges() {
  try {
    const { data } = await supabase
      .from('sync_state')
      .select('updated_at')
      .eq('id', 1)
      .single();
    if (!data?.updated_at) return;
    const remoteTime = new Date(data.updated_at).getTime();
    if (remoteTime > _lastPushedAt + 90000) {
      _hasPendingChanges = true;
      notifyListeners();
    }
  } catch {}
}

if (Platform.OS !== 'web') {
  // Native: poll and flag — user taps Sync manually
  setTimeout(checkForRemoteChanges, 5000);
  setInterval(checkForRemoteChanges, 30000);
} else {
  // Web: on first load always sync to pull remote photos into local store.
  // Subsequent polls only sync if remote updated_at is > 10s newer than our last push.
  let _firstPoll = true;
  async function webAutoPoll() {
    try {
      const { data } = await supabase
        .from('sync_state')
        .select('updated_at')
        .eq('id', 1)
        .single();
      if (!data?.updated_at) return;
      const remoteTime = new Date(data.updated_at).getTime();
      if (_firstPoll || remoteTime > _lastPushedAt + 10000) {
        _firstPoll = false;
        await syncWithCloud();
      }
    } catch {}
  }
  setTimeout(webAutoPoll, 5000);
  setInterval(webAutoPoll, 30000);
}

function collectRemoteImageUrls(units: UnitsStore): string[] {
  const urls: string[] = [];
  for (const unit of Object.values(units)) {
    for (const comp of Object.values(unit.components)) {
      for (const issue of comp.issues) urls.push(...(issue.images ?? []));
      urls.push(...(comp.progressImages ?? []), ...(comp.goodImages ?? []));
    }
    for (const item of (unit.miscEquipment ?? [])) {
      for (const issue of item.issues) urls.push(...(issue.images ?? []));
      urls.push(...(item.progressImages ?? []), ...(item.goodImages ?? []));
    }
  }
  return urls.filter((u) => u?.startsWith('https://'));
}

// Wraps a Supabase call with an AbortController-backed timeout. Aborts the
// underlying fetch so the connection is actually released, not just abandoned.
async function withAbortTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const result = await fn(ac.signal);
    // supabase-js v2 returns abort errors in the result object instead of throwing
    if (ac.signal.aborted) throw new Error(`${label} timed out after ${ms / 1000}s`);
    return result;
  } catch (err: any) {
    if (ac.signal.aborted) throw new Error(`${label} timed out after ${ms / 1000}s`);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function _syncBody(): Promise<SyncResult> {
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;
  const { units: localUnits, generalIssues: localGeneralIssues } = useStore.getState();
  let uploadStatus = '';

  // 1. Upload any local file-path photos to Supabase Storage (30s timeout)
  try {
    const uploadResult = await Promise.race([
      uploadLocalPhotos(localUnits),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('upload timed out after 30s')), 30_000)),
    ]);
    if (uploadResult.updated) {
      useStore.getState().loadBackup(uploadResult.units as UnitsStore, localGeneralIssues);
    }
    uploadStatus = uploadResult.status;
    console.log(`[sync] upload done (${elapsed()})`);
  } catch (photoErr: any) {
    return { success: false, error: `Photo upload failed: ${photoErr?.message ?? photoErr}` };
  }

  // 2. Fetch remote state (20s timeout, aborts the underlying request)
  let data: any;
  try {
    const result = await withAbortTimeout(
      (signal) => supabase.from('sync_state').select('units, general_issues').eq('id', 1).single().abortSignal(signal),
      20_000,
      'Fetch remote state'
    );
    if (result.error) return { success: false, error: result.error.message ?? 'Failed to fetch remote state' };
    data = result.data;
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to fetch remote state' };
  }
  console.log(`[sync] fetch done (${elapsed()})`);

  // 3. Merge remote into local
  const remoteUnits = (data.units ?? {}) as UnitsStore;
  const remoteGeneralIssues = (data.general_issues ?? []) as GeneralIssue[];
  if (Object.keys(remoteUnits).length > 0 || remoteGeneralIssues.length > 0) {
    useStore.getState().mergeImport(remoteUnits, remoteGeneralIssues);
  }
  console.log(`[sync] merge done (${elapsed()})`);

  // 4. Push merged state back to cloud (25s timeout, aborts the underlying request)
  const { units: finalUnits, generalIssues: finalGeneralIssues } = useStore.getState();
  const payloadSize = JSON.stringify(finalUnits).length + JSON.stringify(finalGeneralIssues).length;
  if (payloadSize > 500_000) console.warn(`[sync] payload is ${(payloadSize / 1024).toFixed(0)} KB — check for embedded base64 images`);
  const now = new Date().toISOString();
  try {
    const pushResult = await withAbortTimeout(
      (signal) => supabase.from('sync_state').update({ units: finalUnits, general_issues: finalGeneralIssues, updated_at: now }).eq('id', 1).abortSignal(signal),
      25_000,
      'Push to cloud'
    );
    if (pushResult.error) return { success: false, error: pushResult.error.message ?? 'Failed to push to cloud' };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to push to cloud' };
  }
  console.log(`[sync] push done (${elapsed()})`);

  // 5. Download any missing remote photos to device for offline access (native only).
  // Fire-and-forget — don't await so a slow download can't hang the sync completion.
  if (Platform.OS !== 'web') {
    downloadPhotosToDevice(finalUnits).catch(() => {});
  }

  const photoStatus = uploadStatus || 'Photos up to date';
  markSuccess();
  return { success: true, timestamp: now, warning: photoStatus };
}

export async function syncWithCloud(): Promise<SyncResult> {
  // Suppress useAutoPush during sync — store mutations inside _syncBody (mergeImport, loadBackup)
  // must not trigger concurrent pushToCloud calls while sync is still in flight.
  _suppressDepth++;

  // Attach .catch() immediately so any rejection from _syncBody is always handled,
  // even if the 45s timeout wins the race and this promise settles after we return.
  const bodyPromise = _syncBody().catch((err: any): SyncResult => {
    markFailure();
    return { success: false, error: err?.message ?? 'Sync failed' };
  });

  const result = await Promise.race([
    bodyPromise,
    new Promise<SyncResult>((resolve) =>
      setTimeout(() => resolve({ success: false, error: 'Sync timed out — check connection' }), 90_000)
    ),
  ]);

  // Decrement only after bodyPromise settles — if the timeout won, _syncBody is still
  // running and mutating the store; decrementing now would let a concurrent sync's
  // auto-push fire while this stalled body is mid-merge.
  bodyPromise.then(() => { _suppressDepth = Math.max(0, _suppressDepth - 1); });

  return result;
}

// Union https:// photo arrays from two sources (a=local, b=remote), no Zustand mutation.
function unionPhotoArrays(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  const aR = (a ?? []).filter(u => u?.startsWith('https://'));
  const bR = (b ?? []).filter(u => u?.startsWith('https://'));
  const all = [...new Set([...aR, ...bR])];
  return all.length ? all : undefined;
}

// Merge remote photo URLs into a deep-copy of localUnits without touching the Zustand store.
// Iterates over REMOTE issues so photos on issues that don't yet exist in the web local store
// are still carried into the push, preventing web's auto-push from silently dropping them.
function injectRemotePhotos(localUnits: Record<string, any>, remoteUnits: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = JSON.parse(JSON.stringify(localUnits));
  for (const [uid, remUnit] of Object.entries(remoteUnits) as [string, any][]) {
    if (!result[uid]) continue;
    for (const [ck, remComp] of Object.entries((remUnit as any).components ?? {}) as [string, any][]) {
      const localComp = result[uid].components?.[ck];
      if (!localComp) continue;
      localComp.progressImages = unionPhotoArrays(localComp.progressImages, remComp.progressImages);
      localComp.goodImages = unionPhotoArrays(localComp.goodImages, remComp.goodImages);
      // Iterate over REMOTE issues — adds photos for issues not yet in web local store
      const localIssueMap = new Map<string, any>((localComp.issues ?? []).map((i: any) => [i.id, i]));
      for (const remIssue of (remComp.issues ?? [])) {
        const remPhotos = (remIssue.images ?? []).filter((u: string) => u?.startsWith('https://'));
        if (remPhotos.length === 0) continue;
        const localIssue = localIssueMap.get(remIssue.id);
        if (localIssue) {
          localIssue.images = unionPhotoArrays(localIssue.images, remIssue.images) ?? [];
        } else {
          // Remote issue not in local — add it so its photo URL isn't lost on push
          localComp.issues = [...(localComp.issues ?? []), { ...remIssue, images: remPhotos }];
        }
      }
    }
    const localMiscMap = new Map<string, any>((result[uid].miscEquipment ?? []).map((m: any) => [m.id, m]));
    for (const remItem of ((remUnit as any).miscEquipment ?? [])) {
      const localItem = localMiscMap.get(remItem.id);
      if (!localItem) continue;
      localItem.progressImages = unionPhotoArrays(localItem.progressImages, remItem.progressImages);
      localItem.goodImages = unionPhotoArrays(localItem.goodImages, remItem.goodImages);
      const localIssueMap2 = new Map<string, any>((localItem.issues ?? []).map((i: any) => [i.id, i]));
      for (const remIssue of (remItem.issues ?? [])) {
        const remPhotos = (remIssue.images ?? []).filter((u: string) => u?.startsWith('https://'));
        if (remPhotos.length === 0) continue;
        const localIssue = localIssueMap2.get(remIssue.id);
        if (localIssue) {
          localIssue.images = unionPhotoArrays(localIssue.images, remIssue.images) ?? [];
        } else {
          localItem.issues = [...(localItem.issues ?? []), { ...remIssue, images: remPhotos }];
        }
      }
    }
  }
  return result;
}

// Ref-counter: >0 means suppress auto-push. Use increment/decrement so concurrent
// syncs (e.g. stalled body + new manual sync) don't prematurely re-enable auto-push.
let _suppressDepth = 0;
export function isSuppressingAutoPush(): boolean { return _suppressDepth > 0; }

// Lightweight push — writes current store state to sync_state.
// On web: fetches remote photo URLs first, injects any missing into the local store
// (suppressing the subscribe to avoid a loop), then writes the enriched state.
export async function pushToCloud(): Promise<void> {
  const { units: localUnits, generalIssues } = useStore.getState();
  let unitsToPush: Record<string, any> = localUnits;

  if (Platform.OS === 'web') {
    try {
      const { data } = await supabase.from('sync_state').select('units').eq('id', 1).single();
      if (data?.units && typeof data.units === 'object') {
        const merged = injectRemotePhotos(localUnits, data.units as Record<string, any>);
        const localCount = collectRemoteImageUrls(localUnits as UnitsStore).length;
        const mergedCount = collectRemoteImageUrls(merged as UnitsStore).length;
        if (mergedCount > localCount) {
          // New remote photos — update local store so UI shows them immediately.
          // Suppress subscribe to avoid triggering another pushToCloud.
          _suppressDepth++;
          useStore.getState().loadBackup(merged as UnitsStore, generalIssues);
          _suppressDepth--;
        }
        unitsToPush = merged;
      }
    } catch {}
  }

  const { error } = await supabase
    .from('sync_state')
    .update({ units: unitsToPush, general_issues: generalIssues, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) { markFailure(); } else { markSuccess(); }
}

// Delete all photos from the bucket, clear refs from the store, and push the
// cleaned state to sync_state so other devices don't restore the URLs on next sync.
export async function wipeAllPhotos(): Promise<{ success: boolean; error?: string }> {
  try {
    const { units, generalIssues } = useStore.getState();

    // Batch-delete all bucket files referenced in the store
    const SUPABASE_PUBLIC = '/storage/v1/object/public/photos/';
    const remoteUrls = collectRemoteImageUrls(units);
    if (remoteUrls.length > 0) {
      const fileNames = remoteUrls
        .map(u => { const p = u.split(SUPABASE_PUBLIC)[1]; return p ? decodeURIComponent(p) : null; })
        .filter((n): n is string => n !== null);
      if (fileNames.length > 0) {
        await supabase.storage.from('photos').remove(fileNames);
      }
    }

    // Clear refs from store
    useStore.getState().clearAllPhotos();

    // Push cleared state so sync_state no longer has any photo URLs
    const { units: clearedUnits, generalIssues: clearedGeneral } = useStore.getState();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('sync_state')
      .update({ units: clearedUnits, general_issues: clearedGeneral, updated_at: now })
      .eq('id', 1);
    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Wipe failed' };
  }
}
